import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api, ApiError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeDateField } from '@/components/ui/native-date-field'

type StatusResp = {
  needs_onboarding: boolean
  society: { id: string; name: string; location?: string | null; city?: string | null } | null
  opening_balance: { opening_date: string; amount: number } | null
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const statusQ = useQuery<StatusResp, ApiError>({
    queryKey: ['onboarding-status'],
    queryFn: () => api.get<StatusResp>('/onboarding/status'),
  })

  const s = statusQ.data
  const needs = s?.needs_onboarding
  const society = s?.society
  const opening = s?.opening_balance

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('')
  const [openingDate, setOpeningDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // prefill when data loads
  if (society && !name && !busy) {
    // only once
    if (society.name) setName(society.name)
    if (society.location) setLocation(society.location ?? '')
    if (society.city) setCity(society.city ?? '')
  }
  if (opening && !amount && opening.amount !== undefined) {
    // handled via effect below would be better, but simple
  }

  if (statusQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (needs === false) {
    navigate('/dashboard', { replace: true })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const amt = Number(amount)
      if (!name.trim()) throw new Error('Society name required')
      if (Number.isNaN(amt) || amt < 0) throw new Error('Opening amount must be >= 0')
      if (!openingDate) throw new Error('Opening date required')
      await api.post('/onboarding/setup', {
        name: name.trim(),
        location: location.trim() || null,
        city: city.trim() || null,
        opening_date: openingDate,
        opening_amount: amt,
      })
      await qc.invalidateQueries({ queryKey: ['onboarding-status'] })
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10 pt-[env(safe-area-inset-top)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome — set up your society</CardTitle>
          <CardDescription>Enter society details and opening cash. This is shown once for the first admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="society-name">Society name</Label>
              <Input id="society-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Housing Society" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="society-location">Location</Label>
                <Input id="society-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="society-city">City</Label>
                <Input id="society-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pune" />
              </div>
            </div>
            <NativeDateField value={openingDate} onChange={setOpeningDate} label="Opening date" id="opening-date" ariaLabel="Opening date" />
            <div className="space-y-2">
              <Label htmlFor="opening-amount">Opening cash amount</Label>
              <Input
                id="opening-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Save and continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
