import { useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function formatDisplay(iso: string) {
  if (!iso) return 'Select date'
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function parseISO(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

type NativeDateFieldProps = {
  value: string
  onChange: (value: string) => void
  label?: string
  id: string
  ariaLabel?: string
  disabled?: boolean
  min?: string
  max?: string
}

export function NativeDateField({ value, onChange, label, id, ariaLabel, disabled }: NativeDateFieldProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const initial = parseISO(value) ?? new Date()
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const openSheet = () => {
    const base = parseISO(value) ?? new Date()
    setDraft(value)
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
    setOpen(true)
  }

  const handleDone = () => {
    if (draft) onChange(draft)
    else if (!value && draft === '') onChange('')
    setOpen(false)
  }

  const handleClear = () => {
    setDraft('')
  }

  const handleToday = () => {
    const t = todayISO()
    setDraft(t)
    const d = parseISO(t)!
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const selectDay = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setDraft(iso)
  }

  const calendar = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay() // 0 Sun
    // Convert to Mon-start (Mon=0 ... Sun=6)
    const offset = (firstDay + 6) % 7
    const total = daysInMonth(viewYear, viewMonth)
    const cells: Array<number | null> = []
    for (let i = 0; i < offset; i++) cells.push(null)
    for (let d = 1; d <= total; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    while (cells.length < 42) cells.push(null) // always 6 rows for stable height
    return cells
  }, [viewYear, viewMonth])

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const todayStr = todayISO()

  return (
    <>
      <div className="relative">
        <Input
          id={id}
          type="date"
          aria-label={ariaLabel ?? label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-12 pr-10 text-sm"
        />
        <button
          type="button"
          aria-label="Open calendar"
          onClick={openSheet}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted"
        >
          <Calendar className="size-4" />
        </button>
      </div>
      {value && <p className="mt-1 text-xs text-muted-foreground">{formatDisplay(value)}</p>}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-hidden pb-[env(safe-area-inset-bottom)] flex flex-col">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border shrink-0" aria-hidden />
          <SheetHeader className="shrink-0">
            <SheetTitle>{label ?? 'Select date'}</SheetTitle>
            <SheetDescription className="sr-only">Pick a date</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
            <div className="rounded-2xl border bg-muted/20 p-3 text-center">
              <div className="text-xs text-muted-foreground">{label ?? 'Date'}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{formatDisplay(draft || value)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{draft || value || 'No date selected'}</div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-10" onClick={handleToday}>
                Today
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-10" onClick={handleClear}>
                <X className="size-4" />
                Clear
              </Button>
            </div>

            {/* Native-feel calendar */}
            <div className="rounded-2xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous month"
                  onClick={() => {
                    const m = viewMonth - 1
                    if (m < 0) {
                      setViewMonth(11)
                      setViewYear((y) => y - 1)
                    } else setViewMonth(m)
                  }}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="text-sm font-semibold">{monthLabel}</div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next month"
                  onClick={() => {
                    const m = viewMonth + 1
                    if (m > 11) {
                      setViewMonth(0)
                      setViewYear((y) => y + 1)
                    } else setViewMonth(m)
                  }}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendar.map((day, idx) => {
                  if (day === null) return <div key={idx} className="h-10" />
                  const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const isSelected = draft === iso
                  const isToday = todayStr === iso
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`Select ${iso}`}
                      onClick={() => selectDay(day)}
                      className={[
                        'h-10 rounded-xl text-sm font-medium transition-colors active:scale-95',
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : isToday
                            ? 'bg-accent text-accent-foreground ring-1 ring-border'
                            : 'hover:bg-muted active:bg-muted',
                      ].join(' ')}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>

              {/* Fallback precise input for power users / tests */}
              <div className="mt-4 border-t pt-3">
                <Input
                  id={`${id}-picker`}
                  type="date"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-11 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="shrink-0 grid grid-cols-2 gap-2 px-4 pb-2">
            <Button variant="outline" className="h-12" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="h-12" onClick={handleDone} disabled={!draft && !!value && draft === '' ? false : !draft}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

export function formatDateForDisplay(iso: string) {
  return formatDisplay(iso)
}
